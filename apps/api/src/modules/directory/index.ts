/**
 * Directory — client and property reference data.
 *
 * Owns: Client, Contact, Property.
 * Depends on: access (authorization), audit.
 *
 * Clients and properties live in one module deliberately: they always change
 * together and share no independent invariants, so splitting them would add
 * ceremony without adding a boundary that means anything.
 */
export { DirectoryModule } from './directory.module';
export { ClientService } from './client.service';
export { ContactService } from './contact.service';
export { PropertyService } from './property.service';
